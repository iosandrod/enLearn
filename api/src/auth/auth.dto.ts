import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class SignInPasswordAuthDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsBoolean()
  setDefault?: boolean;
}

export class EmailPasswordAuthDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class OAuthUrlDto {
  @IsString()
  @IsIn(['github'])
  provider!: 'github';

  @IsString()
  @IsNotEmpty()
  redirectTo!: string;
}

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class SetSessionDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsNumber()
  expiresAt?: number;
}

export class SelectAccountDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsOptional()
  @IsBoolean()
  setDefault?: boolean;
}
