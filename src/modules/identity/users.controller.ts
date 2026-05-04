import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenantContext } from '../../common/decorators/tenant-context.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TenantContext } from '../../common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('identity.user.read')
  list(
    @Query() query: ListUsersDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.users.list(query, tenantContext);
  }

  @Post()
  @RequirePermissions('identity.user.create')
  create(
    @Body() body: CreateUserDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.users.create(body, tenantContext);
  }

  @Get(':id')
  @RequirePermissions('identity.user.read')
  get(
    @Param('id') id: string,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.users.get(id, tenantContext);
  }

  @Patch(':id')
  @RequirePermissions('identity.user.update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentTenantContext() tenantContext: TenantContext,
  ) {
    return this.users.update(id, body, tenantContext);
  }
}
