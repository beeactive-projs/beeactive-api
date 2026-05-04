import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';

import { NotificationReceiptService } from './notification-receipt.service';
import { NotificationReceipt } from '../entities/notification-receipt.entity';
import { Notification } from '../entities/notification.entity';
import {
  makeModelMock,
  type ModelMock,
} from '../../../../test/helpers/sequelize-mocks';

type ReceiptStub = {
  id: string;
  userId: string;
  notificationId: string;
  readAt: Date | null;
  viewedAt: Date | null;
  clickedAt: Date | null;
  dismissedAt: Date | null;
  save: jest.Mock;
};

function makeReceipt(overrides: Partial<ReceiptStub> = {}): ReceiptStub {
  return {
    id: 'r-1',
    userId: 'user-1',
    notificationId: 'n-1',
    readAt: null,
    viewedAt: null,
    clickedAt: null,
    dismissedAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('NotificationReceiptService', () => {
  let service: NotificationReceiptService;
  let receiptModel: ModelMock & {
    findAndCountAll: jest.Mock;
    count: jest.Mock;
  };
  let notifModel: ModelMock;

  beforeEach(async () => {
    receiptModel = Object.assign(makeModelMock(), {
      findAndCountAll: jest.fn(),
      count: jest.fn(),
    });
    notifModel = makeModelMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationReceiptService,
        { provide: getModelToken(NotificationReceipt), useValue: receiptModel },
        { provide: getModelToken(Notification), useValue: notifModel },
      ],
    }).compile();

    service = moduleRef.get(NotificationReceiptService);
  });

  describe('markAsRead', () => {
    it('sets read_at when previously unread', async () => {
      const receipt = makeReceipt();
      receiptModel.findOne.mockResolvedValue(receipt);
      await service.markAsRead('user-1', 'r-1');
      expect(receipt.readAt).toBeInstanceOf(Date);
      expect(receipt.save).toHaveBeenCalled();
    });

    it('is a no-op when already read', async () => {
      const alreadyRead = new Date('2026-01-01');
      const receipt = makeReceipt({ readAt: alreadyRead });
      receiptModel.findOne.mockResolvedValue(receipt);
      await service.markAsRead('user-1', 'r-1');
      expect(receipt.readAt).toBe(alreadyRead);
      expect(receipt.save).not.toHaveBeenCalled();
    });

    it('throws 404 (not 403) when receipt is not owned by user', async () => {
      receiptModel.findOne.mockResolvedValue(null);
      await expect(service.markAsRead('user-1', 'r-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAsClicked', () => {
    it('sets both clicked_at and read_at in one save', async () => {
      const receipt = makeReceipt();
      receiptModel.findOne.mockResolvedValue(receipt);
      await service.markAsClicked('user-1', 'r-1');
      expect(receipt.clickedAt).toBeInstanceOf(Date);
      expect(receipt.readAt).toBeInstanceOf(Date);
      expect(receipt.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAllAsRead', () => {
    it('updates all unread for the user', async () => {
      receiptModel.update.mockResolvedValue([12]);
      const result = await service.markAllAsRead('user-1');
      expect(result.updated).toBe(12);
    });
  });

  describe('markAsViewed', () => {
    it('is a no-op when no IDs are provided', async () => {
      const result = await service.markAsViewed('user-1', []);
      expect(receiptModel.update).not.toHaveBeenCalled();
      expect(result.updated).toBe(0);
    });

    it('updates only receipts owned by the user', async () => {
      receiptModel.update.mockResolvedValue([2]);
      const result = await service.markAsViewed('user-1', ['r-1', 'r-2']);
      expect(receiptModel.update).toHaveBeenCalled();
      expect(result.updated).toBe(2);
    });
  });

  describe('remove', () => {
    it('hard-deletes the receipt', async () => {
      receiptModel.destroy.mockResolvedValue(1);
      await expect(service.remove('user-1', 'r-1')).resolves.toBeUndefined();
    });

    it('throws 404 when nothing was deleted', async () => {
      receiptModel.destroy.mockResolvedValue(0);
      await expect(service.remove('user-1', 'r-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
