import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AuthenticatedRequest,
  RequestUser,
} from '../../common/types/authenticated-request';
import { LoginDto } from './dto/login.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest) {
    return this.authService.login(dto, request);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return user;
  }

  @Get('contexts')
  @UseGuards(JwtAuthGuard)
  contexts(@CurrentUser() user: RequestUser) {
    return this.authService.contexts(user);
  }

  @Get('menus')
  @UseGuards(JwtAuthGuard)
  menus(@CurrentUser() user: RequestUser) {
    return this.authService.menus(user);
  }

  @Post('switch-context')
  @UseGuards(JwtAuthGuard)
  switchContext(
    @CurrentUser() user: RequestUser,
    @Body() dto: SwitchContextDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.switchContext(user, dto, request);
  }
}
