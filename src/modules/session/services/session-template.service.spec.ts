import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SessionTemplateService } from './session-template.service';
import { RecurrenceService } from './recurrence.service';
import { SessionTemplate } from '../entities/session-template.entity';
import { SessionInstance } from '../entities/session-instance.entity';
import {
  SessionInstanceStatus,
  SessionTemplateStatus,
} from '../entities/session.enums';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

const makeTx = () => ({
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
});

function makeTemplateMock() {
  return {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    sequelize: { transaction: jest.fn() },
  };
}

function makeInstanceMock() {
  return {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
}

const VALID_DTO = {
  title: 'Morning Yoga',
  type: 'GROUP' as const,
  access: 'OPEN' as const,
  locationKind: 'IN_PERSON' as const,
  durationMinutes: 60,
  timezone: 'Europe/Bucharest',
  isRecurring: false,
  firstStartAt: '2026-07-01T08:00:00.000Z',
};

describe('SessionTemplateService', () => {
  let service: SessionTemplateService;
  let templateMock: ReturnType<typeof makeTemplateMock>;
  let instanceMock: ReturnType<typeof makeInstanceMock>;

  beforeEach(async () => {
    templateMock = makeTemplateMock();
    instanceMock = makeInstanceMock();

    const module = await Test.createTestingModule({
      providers: [
        SessionTemplateService,
        RecurrenceService,
        { provide: getModelToken(SessionTemplate), useValue: templateMock },
        { provide: getModelToken(SessionInstance), useValue: instanceMock },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = module.get(SessionTemplateService);
  });

  describe('create', () => {
    it('creates a one-off template + 1 instance', async () => {
      const tx = makeTx();
      templateMock.sequelize.transaction.mockResolvedValue(tx);
      templateMock.findOne.mockResolvedValue(null); // no slug collision

      const fakeTemplate = {
        id: 'tmpl-1',
        instructorId: 'usr-1',
        durationMinutes: 60,
        firstStartAt: new Date(VALID_DTO.firstStartAt),
        isRecurring: false,
        recurrenceRule: null,
        timezone: 'Europe/Bucharest',
        update: jest.fn(),
      };
      templateMock.create.mockResolvedValue(fakeTemplate);

      const fakeInstance = { id: 'inst-1', occurrenceIndex: 0 };
      instanceMock.create.mockResolvedValue(fakeInstance);

      const result = await service.create('usr-1', VALID_DTO);

      expect(templateMock.create).toHaveBeenCalledTimes(1);
      expect(instanceMock.create).toHaveBeenCalledTimes(1);
      expect(result.generatedInstances).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(tx.commit).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid timezone', async () => {
      await expect(
        service.create('usr-1', { ...VALID_DTO, timezone: 'Not/A/Timezone' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rolls back tx when create throws', async () => {
      const tx = makeTx();
      templateMock.sequelize.transaction.mockResolvedValue(tx);
      templateMock.findOne.mockResolvedValue(null);
      templateMock.create.mockRejectedValue(new Error('DB error'));

      await expect(service.create('usr-1', VALID_DTO)).rejects.toThrow(
        'DB error',
      );
      expect(tx.rollback).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns paginated templates for instructor', async () => {
      const rows = [{ id: 'tmpl-1' }, { id: 'tmpl-2' }];
      templateMock.findAndCountAll.mockResolvedValue({ rows, count: 2 });

      const result = await service.list('usr-1', { page: 1, limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(templateMock.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ instructorId: 'usr-1' }),
        }),
      );
    });
  });

  describe('getById', () => {
    it('returns template when found and owned', async () => {
      const tmpl = { id: 'tmpl-1', instructorId: 'usr-1' };
      templateMock.findOne.mockResolvedValue(tmpl);

      const result = await service.getById('usr-1', 'tmpl-1');
      expect(result).toBe(tmpl);
    });

    it('throws NotFoundException when template not found', async () => {
      templateMock.findOne.mockResolvedValue(null);
      await expect(service.getById('usr-1', 'tmpl-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when template owned by another instructor', async () => {
      templateMock.findOne.mockResolvedValue(null); // findOne with instructorId filter returns null
      await expect(service.getById('usr-other', 'tmpl-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies partial field updates', async () => {
      const tmpl = {
        id: 'tmpl-1',
        instructorId: 'usr-1',
        update: jest.fn().mockImplementation(function (
          this: unknown,
          updates: unknown,
        ) {
          Object.assign(this as object, updates as object);
          return Promise.resolve(this);
        }),
      };
      templateMock.findOne.mockResolvedValue(tmpl);

      const result = await service.update('usr-1', 'tmpl-1', {
        title: 'New Title',
      });

      expect(tmpl.update).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Title' }),
      );
      expect(result).toBe(tmpl);
    });

    it('throws BadRequestException for invalid timezone in update', async () => {
      templateMock.findOne.mockResolvedValue({
        id: 'tmpl-1',
        instructorId: 'usr-1',
        update: jest.fn(),
      });
      await expect(
        service.update('usr-1', 'tmpl-1', { timezone: 'Bad/Zone' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('ends template and cancels future scheduled instances', async () => {
      const tx = makeTx();
      templateMock.sequelize.transaction.mockResolvedValue(tx);

      const tmpl = {
        id: 'tmpl-1',
        instructorId: 'usr-1',
        update: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      templateMock.findOne.mockResolvedValue(tmpl);
      instanceMock.update.mockResolvedValue([0]);

      await service.delete('usr-1', 'tmpl-1');

      expect(instanceMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: SessionInstanceStatus.Cancelled }),
        expect.objectContaining({
          where: expect.objectContaining({ templateId: 'tmpl-1' }),
        }),
      );
      expect(tmpl.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: SessionTemplateStatus.Ended }),
        expect.anything(),
      );
      expect(tmpl.destroy).toHaveBeenCalled();
      expect(tx.commit).toHaveBeenCalled();
    });
  });

  describe('previewRecurrence', () => {
    it('returns ISO occurrences array', () => {
      const result = service.previewRecurrence({
        rule: { frequency: 'DAILY', interval: 1, endAfterOccurrences: 3 },
        firstStartAt: '2026-07-01T08:00:00.000Z',
        timezone: 'Europe/Bucharest',
      });

      expect(result.occurrences).toHaveLength(3);
      expect(result.occurrences[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
