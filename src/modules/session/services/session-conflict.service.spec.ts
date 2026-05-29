import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { SessionConflictService } from './session-conflict.service';
import { SessionInstance } from '../entities/session-instance.entity';
import { SessionInstanceStatus } from '../entities/session.enums';

const fakeTx = {} as never;

const makePeer = (id: string, conflicting: string[] | null = null) => ({
  id,
  conflictingInstanceIds: conflicting,
  update: jest.fn().mockResolvedValue(undefined),
});

describe('SessionConflictService', () => {
  let service: SessionConflictService;
  let instanceModel: { findAll: jest.Mock };

  beforeEach(async () => {
    instanceModel = { findAll: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        SessionConflictService,
        { provide: getModelToken(SessionInstance), useValue: instanceModel },
      ],
    }).compile();
    service = module.get(SessionConflictService);
  });

  // The instance under test
  const subject = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'inst-1',
      instructorId: 'usr-1',
      status: SessionInstanceStatus.Scheduled,
      startAt: new Date('2026-06-01T10:00:00Z'),
      endAt: new Date('2026-06-01T11:00:00Z'),
      conflictingInstanceIds: null,
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as SessionInstance;

  it('D7: writes the symmetric view — both sides know about each other', async () => {
    const peer = makePeer('peer-1');
    instanceModel.findAll.mockResolvedValue([peer]);
    const inst = subject();
    const result = await service.recomputeFor(inst, fakeTx);
    expect(result).toEqual(['peer-1']);
    expect(peer.update).toHaveBeenCalledWith(
      expect.objectContaining({ conflictingInstanceIds: ['inst-1'] }),
      expect.anything(),
    );
    expect(
      (inst as unknown as { update: jest.Mock }).update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ conflictingInstanceIds: ['peer-1'] }),
      expect.anything(),
    );
  });

  it('D7b: query filters by instructor + overlap + SCHEDULED', async () => {
    instanceModel.findAll.mockResolvedValue([]);
    await service.recomputeFor(subject(), fakeTx);
    const call = instanceModel.findAll.mock.calls[0][0] as {
      where: Record<string | symbol, unknown>;
    };
    expect(call.where['instructorId']).toBe('usr-1');
    expect(call.where['status']).toBe(SessionInstanceStatus.Scheduled);
    expect(call.where['id']).toEqual({ [Op.ne]: 'inst-1' });
    // overlap window: startAt < other.endAt AND endAt > other.startAt
    expect((call.where['startAt'] as Record<symbol, Date>)[Op.lt]).toEqual(
      new Date('2026-06-01T11:00:00Z'),
    );
    expect((call.where['endAt'] as Record<symbol, Date>)[Op.gt]).toEqual(
      new Date('2026-06-01T10:00:00Z'),
    );
  });

  it('D7c: idempotent — peer already lists this instance, no duplicate', async () => {
    const peer = makePeer('peer-1', ['inst-1']); // already knows
    instanceModel.findAll.mockResolvedValue([peer]);
    await service.recomputeFor(subject(), fakeTx);
    expect(peer.update).not.toHaveBeenCalled(); // no rewrite
  });

  it('D8: no overlap → empty array, no false positives', async () => {
    instanceModel.findAll.mockResolvedValue([]);
    const inst = subject();
    const result = await service.recomputeFor(inst, fakeTx);
    expect(result).toEqual([]);
    expect(
      (inst as unknown as { update: jest.Mock }).update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ conflictingInstanceIds: null }),
      expect.anything(),
    );
  });

  it('cleans up stale peers when instance moves away from a former conflict', async () => {
    // Subject used to conflict with stale-1, but now overlaps peer-2 only.
    const peer2 = makePeer('peer-2');
    instanceModel.findAll
      .mockResolvedValueOnce([peer2]) // first call: current overlaps
      .mockResolvedValueOnce([makePeer('stale-1', ['inst-1', 'other'])]); // second call: stale peers

    const inst = subject({ conflictingInstanceIds: ['stale-1'] });
    const result = await service.recomputeFor(inst, fakeTx);

    expect(result).toEqual(['peer-2']);
    // stale-1 should have inst-1 removed from its array
    const stalePeerUpdate = instanceModel.findAll.mock.calls.length;
    expect(stalePeerUpdate).toBe(2);
  });
});
