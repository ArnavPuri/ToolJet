import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Delete,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import { AppsService } from '../services/apps.service';
import { decamelizeKeys } from 'humps';
import { AppsAbilityFactory } from 'src/modules/casl/abilities/apps-ability.factory';
import { AppAuthGuard } from 'src/modules/auth/app-auth.guard';
import { FoldersService } from '@services/folders.service';
import { App } from 'src/entities/app.entity';
import { AppImportExportService } from '@services/app_import_export.service';

@Controller('apps')
export class AppsController {
  constructor(
    private appsService: AppsService,
    private appImportExportService: AppImportExportService,
    private foldersService: FoldersService,
    private appsAbilityFactory: AppsAbilityFactory
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req) {
    const ability = await this.appsAbilityFactory.appsActions(req.user, {});

    if (!ability.can('createApp', App)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }
    const app = await this.appsService.create(req.user);

    await this.appsService.update(req.user, app.id, {
      slug: app.id,
    });

    return decamelizeKeys(app);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async show(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('viewApp', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }
    const response = decamelizeKeys(app);

    const seralizedQueries = [];

    // serialize queries
    for (const query of app.dataQueries) {
      const decamelizedQuery = decamelizeKeys(query);
      decamelizedQuery['options'] = query.options;
      seralizedQueries.push(decamelizedQuery);
    }

    response['data_queries'] = seralizedQueries;
    response['definition'] = app.editingVersion?.definition;

    return response;
  }

  @UseGuards(AppAuthGuard) // This guard will allow access for unauthenticated user if the app is public
  @Get('slugs/:slug')
  async appFromSlug(@Request() req, @Param() params) {
    if (req.user) {
      const app = await this.appsService.findBySlug(params.slug);
      const ability = await this.appsAbilityFactory.appsActions(req.user, {
        id: app.id,
      });

      if (!ability.can('viewApp', app)) {
        throw new ForbiddenException('You do not have permissions to perform this action');
      }
    }

    const app = await this.appsService.findBySlug(params.slug);

    // serialize
    return {
      current_version_id: app['current_version_id'],
      data_queries: app.dataQueries,
      definition: app.editingVersion?.definition,
      is_public: app.isPublic,
      name: app.name,
      slug: app.slug,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('updateParams', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const result = await this.appsService.update(req.user, params.id, req.body.app);
    const response = decamelizeKeys(result);

    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/clone')
  async clone(@Request() req, @Param() params) {
    const existingApp = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('cloneApp', existingApp)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const result = await this.appsService.clone(existingApp, req.user);
    const response = decamelizeKeys(result);

    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/export')
  async export(@Request() req, @Param() params) {
    const appToExport = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('viewApp', appToExport)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const app = await this.appImportExportService.export(req.user, params.id);
    return app;
  }

  @UseGuards(JwtAuthGuard)
  @Post('/import')
  async import(@Request() req) {
    const ability = await this.appsAbilityFactory.appsActions(req.user, {});

    if (!ability.can('createApp', App)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }
    await this.appImportExportService.import(req.user, req.body);

    return;
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('deleteApp', app)) {
      throw new ForbiddenException('Only administrators are allowed to delete apps.');
    }

    const result = await this.appsService.delete(params.id);
    const response = decamelizeKeys(result);

    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async index(@Request() req, @Query() query) {
    const page = req.query.page;
    const folderId = req.query.folder;

    let apps = [];
    let folderCount = 0;

    if (folderId) {
      const folder = await this.foldersService.findOne(folderId);
      apps = await this.foldersService.getAppsFor(req.user, folder, page);
      folderCount = await this.foldersService.userAppCount(req.user, folder);
    } else {
      apps = await this.appsService.all(req.user, page);
    }

    const totalCount = await this.appsService.count(req.user);

    const totalPageCount = folderId ? folderCount : totalCount;

    const meta = {
      total_pages: Math.ceil(totalPageCount / 10),
      total_count: totalCount,
      folder_count: folderCount,
      current_page: parseInt(page || 1),
    };

    const response = {
      meta,
      apps,
    };

    return decamelizeKeys(response);
  }

  // deprecated
  @UseGuards(JwtAuthGuard)
  @Get(':id/users')
  async fetchUsers(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('fetchUsers', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const result = await this.appsService.fetchUsers(req.user, params.id);
    return decamelizeKeys({ users: result });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/versions')
  async fetchVersions(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('fetchVersions', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const result = await this.appsService.fetchVersions(req.user, params.id);
    return { versions: result };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/versions')
  async createVersion(@Request() req, @Param() params) {
    const versionName = req.body['versionName'];

    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('createVersions', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const appUser = await this.appsService.createVersion(req.user, app, versionName);
    return decamelizeKeys(appUser);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/versions/:versionId')
  async version(@Request() req, @Param() params) {
    const app = await this.appsService.find(params.id);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('fetchVersions', app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const appVersion = await this.appsService.findVersion(params.versionId);

    return { ...appVersion, data_queries: app.dataQueries };
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/versions/:versionId')
  async updateVersion(@Request() req, @Param() params) {
    const definition = req.body['definition'];

    const version = await this.appsService.findVersion(params.versionId);
    const ability = await this.appsAbilityFactory.appsActions(req.user, params);

    if (!ability.can('updateVersions', version.app)) {
      throw new ForbiddenException('You do not have permissions to perform this action');
    }

    const appUser = await this.appsService.updateVersion(req.user, version, definition);
    return decamelizeKeys(appUser);
  }
}
