import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { SessionAccessService } from './session-access.service';
import { InstructorClient } from '../../client/entities/instructor-client.entity';
import { GroupMember } from '../../group/entities/group-member.entity';
import { SessionParticipant } from '../entities/session-participant.entity';
import { SessionAccess } from '../entities/session.enums';

const instance = { id: 'inst-1', instructorId: 'usr-1' };

describe('SessionAccessService', () => {
  let service: SessionAccessService;
  let clientModel: { findOne: jest.Mock };
  let groupMemberModel: { findOne: jest.Mock };
  let participantModel: { findOne: jest.Mock };

  beforeEach(async () => {
    clientModel = { findOne: jest.fn() };
    groupMemberModel = { findOne: jest.fn() };
    participantModel = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SessionAccessService,
        { provide: getModelToken(InstructorClient), useValue: clientModel },
        { provide: getModelToken(GroupMember), useValue: groupMemberModel },
        {
          provide: getModelToken(SessionParticipant),
          useValue: participantModel,
        },
      ],
    }).compile();

    service = module.get(SessionAccessService);
  });

  it('owner short-circuits: full access, no DB hits', async () => {
    const result = await service.evaluate(
      instance,
      {
        access: SessionAccess.GroupOnly,
        instructorId: 'usr-1',
        groupId: 'g-1',
      },
      'usr-1',
    );
    expect(result).toEqual({
      canView: true,
      isOwner: true,
      isParticipant: false,
      isEligible: false,
    });
    expect(clientModel.findOne).not.toHaveBeenCalled();
    expect(groupMemberModel.findOne).not.toHaveBeenCalled();
    expect(participantModel.findOne).not.toHaveBeenCalled();
  });

  it('OPEN: any authed caller is eligible', async () => {
    participantModel.findOne.mockResolvedValue(null);
    const result = await service.evaluate(
      instance,
      { access: SessionAccess.Open, instructorId: 'usr-1', groupId: null },
      'usr-other',
    );
    expect(result.isEligible).toBe(true);
    expect(result.canView).toBe(true);
    expect(clientModel.findOne).not.toHaveBeenCalled();
    expect(groupMemberModel.findOne).not.toHaveBeenCalled();
  });

  it('FREE: anonymous (callerId=null) is eligible (read-only public path)', async () => {
    const result = await service.evaluate(
      instance,
      { access: SessionAccess.Free, instructorId: 'usr-1', groupId: null },
      null,
    );
    expect(result.canView).toBe(true);
    expect(result.isEligible).toBe(true);
  });

  it('CLIENTS_ONLY: not a client → not eligible, not viewable', async () => {
    participantModel.findOne.mockResolvedValue(null);
    clientModel.findOne.mockResolvedValue(null);
    const result = await service.evaluate(
      instance,
      {
        access: SessionAccess.ClientsOnly,
        instructorId: 'usr-1',
        groupId: null,
      },
      'usr-other',
    );
    expect(result.isEligible).toBe(false);
    expect(result.canView).toBe(false);
  });

  it('CLIENTS_ONLY: active client → eligible', async () => {
    participantModel.findOne.mockResolvedValue(null);
    clientModel.findOne.mockResolvedValue({ id: 'rel-1' });
    const result = await service.evaluate(
      instance,
      {
        access: SessionAccess.ClientsOnly,
        instructorId: 'usr-1',
        groupId: null,
      },
      'usr-other',
    );
    expect(result.isEligible).toBe(true);
    expect(result.canView).toBe(true);
  });

  it('GROUP_ONLY: existing participant stays visible even if not in group anymore', async () => {
    // canView=true via participation, isEligible=false because non-member
    participantModel.findOne.mockResolvedValue({ id: 'p-1' });
    groupMemberModel.findOne.mockResolvedValue(null);
    const result = await service.evaluate(
      instance,
      {
        access: SessionAccess.GroupOnly,
        instructorId: 'usr-1',
        groupId: 'g-1',
      },
      'usr-other',
    );
    expect(result.canView).toBe(true);
    expect(result.isParticipant).toBe(true);
    expect(result.isEligible).toBe(false);
  });

  it('GROUP_ONLY non-member, no participation → blocked (404 upstream)', async () => {
    participantModel.findOne.mockResolvedValue(null);
    groupMemberModel.findOne.mockResolvedValue(null);
    const result = await service.evaluate(
      instance,
      {
        access: SessionAccess.GroupOnly,
        instructorId: 'usr-1',
        groupId: 'g-1',
      },
      'usr-other',
    );
    expect(result.canView).toBe(false);
  });

  it('GROUP_ONLY with no groupId set on template → not eligible (defensive)', async () => {
    participantModel.findOne.mockResolvedValue(null);
    const result = await service.evaluate(
      instance,
      { access: SessionAccess.GroupOnly, instructorId: 'usr-1', groupId: null },
      'usr-other',
    );
    expect(result.canView).toBe(false);
  });
});
