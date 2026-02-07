'use strict';

import { SetMetadata } from '@nestjs/common';

/**
 * Permissions Decorator
 *
 * Usage:
 * @Permissions('user.create', 'user.update')
 *
 * User needs ALL of these permissions to access the route
 */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
