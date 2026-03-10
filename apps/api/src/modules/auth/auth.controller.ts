// apps/api/src/modules/auth/auth.controller.ts
import {
  Controller, Post, Body, Req, Res, HttpCode, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response }  from 'express';
import { AuthService }        from './auth.service';
import { RegisterDto }        from './dto/register.dto';
import { LoginDto }           from './dto/login.dto';
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'ユーザー登録' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    return this.authService.register(dto, res, req);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'ログイン' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    return this.authService.login(dto, res, req);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'AccessToken 再発行' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(req, res);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ログアウト' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.sub, res);
  }
}