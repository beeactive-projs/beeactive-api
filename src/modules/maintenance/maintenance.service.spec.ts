import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { Invitation } from '../invitation/entities/invitation.entity';
import {
  ClientRequest,
  ClientRequestStatus,
} from '../client/entities/client-request.entity';
import { MaintenanceService } from './maintenance.service';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  const refreshTokenModel = { destroy: jest.fn() };
  const userModel = { update: jest.fn() };
  const invitationModel = { update: jest.fn() };
  const clientRequestModel = { update: jest.fn() };
  const now = new Date('2026-06-15T00:00:00Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: getModelToken(RefreshToken), useValue: refreshTokenModel },
        { provide: getModelToken(User), useValue: userModel },
        { provide: getModelToken(Invitation), useValue: invitationModel },
        { provide: getModelToken(ClientRequest), useValue: clientRequestModel },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = ref.get(MaintenanceService);
  });

  it('purges refresh tokens whose expiry has passed', async () => {
    refreshTokenModel.destroy.mockResolvedValue(7);
    const r = await service.purgeExpiredRefreshTokens(now);
    expect(r).toEqual({ deleted: 7 });
    expect(refreshTokenModel.destroy).toHaveBeenCalledWith({
      where: { expiresAt: { [Op.lt]: now } },
    });
  });

  it('clears lockouts whose window elapsed (reset attempts + lock)', async () => {
    userModel.update.mockResolvedValue([3]);
    const r = await service.clearExpiredLockouts(now);
    expect(r).toEqual({ cleared: 3 });
    expect(userModel.update).toHaveBeenCalledWith(
      { failedLoginAttempts: 0, lockedUntil: null },
      { where: { lockedUntil: { [Op.lt]: now } } },
    );
  });

  it('expires stale pending invitations (sets declinedAt)', async () => {
    invitationModel.update.mockResolvedValue([2]);
    const r = await service.expireStaleInvitations(now);
    expect(r).toEqual({ expired: 2 });
    const [values, opts] = invitationModel.update.mock.calls[0] as [
      Record<string, unknown>,
      { where: Record<string, unknown> },
    ];
    expect(values).toEqual({ declinedAt: now });
    expect(opts.where).toMatchObject({
      expiresAt: { [Op.lt]: now },
      acceptedAt: null,
      declinedAt: null,
    });
  });

  it('expires PENDING client requests past their window → DECLINED', async () => {
    clientRequestModel.update.mockResolvedValue([5]);
    const r = await service.expireStaleClientRequests(now);
    expect(r).toEqual({ expired: 5 });
    expect(clientRequestModel.update).toHaveBeenCalledWith(
      { status: ClientRequestStatus.DECLINED, respondedAt: now },
      {
        where: {
          status: ClientRequestStatus.PENDING,
          expiresAt: { [Op.lt]: now },
        },
      },
    );
  });
});
