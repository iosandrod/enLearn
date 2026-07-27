import { invokeBackendService } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  return invokeBackendService(event, 'posts', 'list');
});
