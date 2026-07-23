import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ServiceInvokeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['payment', 'user', 'lowcode', 'admin'])
  serviceName!: 'payment' | 'user' | 'lowcode' | 'admin';

  @IsString()
  @IsNotEmpty()
  serviceMethod!: string;

  @IsOptional()
  @IsObject()
  postData?: Record<string, unknown>;
}
