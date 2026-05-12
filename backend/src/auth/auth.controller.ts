import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto, @Req() req: any) {
    return this.authService.login(body.email, body.senha, {
      twoFactorCode: body.twoFactorCode,
      deviceId: body.deviceId,
      deviceName: body.deviceName,
      ip: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  }

  @Get('me')
  me(@Headers('authorization') authorization: string) {
    return this.authService.me(authorization);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  logout(@Headers('authorization') authorization: string) {
    return this.authService.logout(authorization);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  logoutAll(@Headers('authorization') authorization: string) {
    return this.authService.logoutAll(authorization);
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt'))
  refresh(@Headers('authorization') authorization: string, @Req() req: any) {
    return this.authService.refresh(authorization, {
      ip: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.headers?.['user-agent'] || null,
      deviceId: req?.headers?.['x-device-id'] || null,
      deviceName: req?.headers?.['x-device-name'] || null,
    });
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard('jwt'))
  iniciar2fa(@Headers('authorization') authorization: string) {
    return this.authService.iniciarConfig2fa(authorization);
  }

  @Post('2fa/confirm')
  @UseGuards(AuthGuard('jwt'))
  confirmar2fa(
    @Headers('authorization') authorization: string,
    @Body() body: { code: string },
  ) {
    return this.authService.confirmarConfig2fa(authorization, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  desativar2fa(@Headers('authorization') authorization: string) {
    return this.authService.desativar2fa(authorization);
  }
}
