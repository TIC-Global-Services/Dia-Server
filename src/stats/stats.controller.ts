import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { StatsService } from './stats.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@Can(PermissionPolicy, 'staff')
@Controller('admin/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }
}
