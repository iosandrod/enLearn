import { Injectable } from '@nestjs/common';
import {
  BaseService,
  type ResourceConfigMap
} from '../common/base.service';

@Injectable()
export class PostsService extends BaseService {
  protected override defaultListItemsType() {
    return 'posts';
  }

  protected override resources(): ResourceConfigMap {
    return {
      posts: {
        tableName: 'posts',
        primaryKey: 'id',
        ownerField: 'user_id',
        list: {
          defaultSorts: [{ field: 'created_at', direction: 'desc' }]
        },
        create: {
          allowedFields: ['title', 'content'],
          requiredFields: ['title'],
          userFields: { owner: 'user_id' }
        },
        update: {
          allowedFields: ['title', 'content']
        }
      }
    };
  }
}
