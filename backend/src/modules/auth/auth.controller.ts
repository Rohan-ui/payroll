import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService, RegisterUserInput, RegisterTenantInput, LoginInput } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterUserInput) {
    return this.authService.registerUser(body);
  }

  @Post('register-tenant')
  async registerTenant(@Body() body: RegisterTenantInput) {
    return this.authService.registerTenant(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginInput) {
    return this.authService.login(body);
  }

  @Get('me')
  async getMe(@Query('userId') userId: string) {
    return this.authService.getMe(userId);
  }

  @Post('membership')
  async addMembership(
    @Body('tenantId') tenantId: string,
    @Body('userId') userId: string,
    @Body('roleCode') roleCode?: string,
  ) {
    return this.authService.addMemberToTenant(tenantId, userId, roleCode);
  }

  @Post('seed-demo')
  @HttpCode(HttpStatus.OK)
  async seedDemo() {
    return this.authService.seedDemoData();
  }
}
