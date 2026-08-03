import assert from 'node:assert/strict';

import type { ResourceConfigMap } from './base.service';
import { AdminService } from '../admin-service/admin.service';
import { ChatService } from '../chat-service/chat.service';
import { EntityDesignService } from '../entity-design-service/entity-design.service';
import { FilesService } from '../files-service/files.service';
import { LowCodeService } from '../lowcode-service/lowcode.service';
import { NotificationService } from '../notification-service/notification.service';
import { PostsService } from '../posts-service/posts.service';

type ServiceWithResources = {
  resources(): ResourceConfigMap;
};

const services = [
  new AdminService(),
  new ChatService(),
  new EntityDesignService(),
  new FilesService(),
  new LowCodeService(),
  new NotificationService(),
  new PostsService()
] as unknown as ServiceWithResources[];

for (const service of services) {
  for (const [resourceName, config] of Object.entries(service.resources())) {
    const tableName = config.tableName.split('.').at(-1);
    assert.equal(
      resourceName,
      tableName,
      `${service.constructor.name}.${resourceName} must match table ${config.tableName}`
    );
  }
}

console.log('resource configuration tests passed');
