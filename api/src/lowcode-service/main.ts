import { bootstrapRedisService } from '../common/service-microservice';
import { AppModule } from './app.module';

void bootstrapRedisService(AppModule, 'Lowcode');
