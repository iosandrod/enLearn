import { Module } from '@nestjs/common';
import { ServiceGatewayController } from './gateway/service-gateway.controller';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat-service/chat.module';
import { DomainClientModule } from './gateway/domain-client.module';

@Module({
  imports: [
    AuthModule,
    ChatModule,
    DomainClientModule
  ],
  controllers: [ServiceGatewayController]
})
export class AppModule {}
