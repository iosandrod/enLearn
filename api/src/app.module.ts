import { Module } from '@nestjs/common';
import { ServiceGatewayController } from './gateway/service-gateway.controller';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat-service/chat.module';
import { DomainClientModule } from './gateway/domain-client.module';
import { AiModule } from './ai/ai.module';
import { InternalServiceController } from './gateway/internal-service.controller';
import { FileUploadController } from './gateway/file-upload.controller';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    DomainClientModule,
    AiModule.forGateway('gateway')
  ],
  controllers: [ServiceGatewayController, FileUploadController, InternalServiceController]
})
export class AppModule {}
