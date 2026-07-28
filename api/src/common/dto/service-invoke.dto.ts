import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ServiceInvokeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['account', 'payment', 'user', 'lowcode', 'admin', 'posts', 'notification', 'workflow'])
  serviceName!: 'account' | 'payment' | 'user' | 'lowcode' | 'admin' | 'posts' | 'notification' | 'workflow';

  @IsString()
  @IsNotEmpty()
  serviceMethod!: string;

  @IsOptional()
  @IsObject()
  postData?: Record<string, unknown>;
}
