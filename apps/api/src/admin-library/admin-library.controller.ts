import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminCategoryInput,
  AdminCategoryUpdateInput,
  AdminDeleteInput,
  AdminDocumentInput,
  AdminDocumentsQuery,
  AdminDocumentUpdateInput,
} from '@indieforge/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminOnlyGuard } from './admin-only.guard.js';
import { AdminLibraryService } from './admin-library.service.js';

function parse<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
    );
  return parsed.data;
}

@Controller('admin/library')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminLibraryController {
  constructor(
    @Inject(AdminLibraryService) private readonly library: AdminLibraryService,
  ) {}

  @Get('categories')
  @Header('Cache-Control', 'private, no-store')
  categories() {
    return this.library.categories();
  }

  @Post('categories')
  createCategory(@Body() body: unknown) {
    return this.library.createCategory(parse(AdminCategoryInput, body));
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: unknown) {
    return this.library.updateCategory(
      id,
      parse(AdminCategoryUpdateInput, body),
    );
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@Param('id') id: string, @Body() body: unknown) {
    return this.library.deleteCategory(id, parse(AdminDeleteInput, body));
  }

  @Get('documents')
  @Header('Cache-Control', 'private, no-store')
  documents(@Query() query: unknown) {
    return this.library.documents(parse(AdminDocumentsQuery, query));
  }

  @Get('documents/:id')
  @Header('Cache-Control', 'private, no-store')
  document(@Param('id') id: string) {
    return this.library.document(id);
  }

  @Post('documents')
  createDocument(@Body() body: unknown) {
    return this.library.createDocument(parse(AdminDocumentInput, body));
  }

  @Patch('documents/:id')
  updateDocument(@Param('id') id: string, @Body() body: unknown) {
    return this.library.updateDocument(
      id,
      parse(AdminDocumentUpdateInput, body),
    );
  }

  @Delete('documents/:id')
  @HttpCode(204)
  deleteDocument(@Param('id') id: string, @Body() body: unknown) {
    return this.library.deleteDocument(id, parse(AdminDeleteInput, body));
  }
}
