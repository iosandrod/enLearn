import { Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  DevImpersonateAuthDto,
  EmailPasswordAuthDto,
  OAuthUrlDto,
  RefreshSessionDto,
  SelectAccountDto,
  SetSessionDto,
  SignInPasswordAuthDto
} from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('signin')
  signInWithPassword(@Body() dto: SignInPasswordAuthDto) {
    return this.authService.signInWithPassword(dto);
  }

  @Get('account-options')
  listLoginAccountOptions(@Query('login') login?: string) {
    return this.authService.listLoginAccountOptions(login);
  }

  @Post('signup')
  signUp(@Body() dto: EmailPasswordAuthDto) {
    return this.authService.signUp(dto);
  }

  @Post('oauth')
  getOAuthUrl(@Body() dto: OAuthUrlDto) {
    return this.authService.getOAuthUrl(dto);
  }

  @Post('session')
  setSession(@Body() dto: SetSessionDto) {
    return this.authService.setSession(dto);
  }

  @Post('refresh')
  refreshSession(@Body() dto: RefreshSessionDto) {
    return this.authService.refreshSession(dto);
  }

  @Post('dev-impersonate')
  impersonateDevUser(
    @Body() dto: DevImpersonateAuthDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-account-id') accountId?: string
  ) {
    return this.authService.impersonateDevUser(dto, {
      authorization,
      requestId,
      accountId
    });
  }

  @Get('me')
  me(
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-account-id') accountId?: string
  ) {
    return this.authService.me({ authorization, requestId, accountId });
  }

  @Post('select-account')
  selectAccount(
    @Body() dto: SelectAccountDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string
  ) {
    return this.authService.selectAccount(dto, { authorization, requestId });
  }

  @Post('signout')
  signOut(
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string
  ) {
    return this.authService.signOut({ authorization, requestId });
  }
}
