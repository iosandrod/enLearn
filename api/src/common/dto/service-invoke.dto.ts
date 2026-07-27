import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ServiceInvokeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['account', 'payment', 'user', 'lowcode', 'admin', 'posts'])
  serviceName!: 'account' | 'payment' | 'user' | 'lowcode' | 'admin' | 'posts';

  @IsString()
  @IsNotEmpty()
  serviceMethod!: string;

  @IsOptional()
  @IsObject()
  postData?: Record<string, unknown>;
}
