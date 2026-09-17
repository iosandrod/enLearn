import { Injectable } from '@nestjs/common';
import { BaseService } from '../common/base.service';

@Injectable()
export class PostsService extends BaseService {
  protected override defaultListItemsType() {
    return 'posts';
  }

}
