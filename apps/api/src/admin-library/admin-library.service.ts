import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { database } from '@indieforge/database';
import type {
  AdminCategory,
  AdminCategoryInput,
  AdminCategoryUpdateInput,
  AdminDeleteInput,
  AdminDocument,
  AdminDocumentInput,
  AdminDocumentList,
  AdminDocumentsQuery,
  AdminDocumentUpdateInput,
} from '@indieforge/contracts';

export const ADMIN_LIBRARY_DATABASE = Symbol('ADMIN_LIBRARY_DATABASE');
type Client = typeof database;
type CategoryRecord = Awaited<
  ReturnType<Client['adminCategory']['findUniqueOrThrow']>
> & { _count: { documents: number } };
const categoryInclude = { _count: { select: { documents: true } } } as const;
const documentSummarySelect = {
  id: true,
  categoryId: true,
  title: true,
  sourcePath: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

function categoryResponse(row: CategoryRecord): AdminCategory {
  const { _count, ...fields } = row;
  return {
    ...fields,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    documentCount: _count.documents,
  };
}
function dates<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function current<T extends { version: number }>(
  row: T | null,
  version: number,
): T {
  if (!row) throw new NotFoundException('Không tìm thấy mục này.');
  if (row.version !== version)
    throw new ConflictException('Mục này đã thay đổi. Vui lòng tải lại.');
  return row;
}
function changed(count: number) {
  if (count !== 1)
    throw new ConflictException('Mục này đã thay đổi. Vui lòng tải lại.');
}

@Injectable()
export class AdminLibraryService {
  constructor(
    @Inject(ADMIN_LIBRARY_DATABASE) private readonly client: Client,
  ) {}

  private async transaction<T>(
    operation: (
      tx: Omit<
        Client,
        | '$connect'
        | '$disconnect'
        | '$on'
        | '$transaction'
        | '$use'
        | '$extends'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(operation);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['P2003', 'P2025', 'P2034'].includes(String(error.code))
      ) {
        throw new ConflictException(
          'Danh mục hoặc tài liệu đã thay đổi. Vui lòng tải lại.',
        );
      }
      throw error;
    }
  }

  async categories(): Promise<AdminCategory[]> {
    const rows = await this.client.adminCategory.findMany({
      include: categoryInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(categoryResponse);
  }
  async createCategory(input: AdminCategoryInput): Promise<AdminCategory> {
    return categoryResponse(
      await this.client.adminCategory.create({
        data: { name: input.name, description: input.description },
        include: categoryInclude,
      }),
    );
  }
  async updateCategory(
    id: string,
    input: AdminCategoryUpdateInput,
  ): Promise<AdminCategory> {
    return this.transaction(async (tx) => {
      current(
        await tx.adminCategory.findUnique({ where: { id } }),
        input.version,
      );
      const result = await tx.adminCategory.updateMany({
        where: { id, version: input.version },
        data: {
          name: input.name,
          description: input.description,
          version: { increment: 1 },
        },
      });
      changed(result.count);
      return categoryResponse(
        await tx.adminCategory.findUniqueOrThrow({
          where: { id },
          include: categoryInclude,
        }),
      );
    });
  }
  async deleteCategory(id: string, input: AdminDeleteInput): Promise<void> {
    return this.transaction(async (tx) => {
      const row = current(
        await tx.adminCategory.findUnique({
          where: { id },
          include: categoryInclude,
        }),
        input.version,
      );
      if (row._count.documents)
        throw new ConflictException(
          'Hãy chuyển hoặc xóa tài liệu trước khi xóa danh mục.',
        );
      changed(
        (
          await tx.adminCategory.deleteMany({
            where: { id, version: input.version },
          })
        ).count,
      );
    });
  }
  async documents(input: AdminDocumentsQuery): Promise<AdminDocumentList> {
    const where = {
      categoryId: input.categoryId,
      sourcePath: input.sourcePath,
      ...(input.query
        ? {
            OR: [
              {
                title: { contains: input.query, mode: 'insensitive' as const },
              },
              {
                content: {
                  contains: input.query,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    return this.transaction(async (tx) => {
      const rows = await tx.adminDocument.findMany({
        where,
        select: documentSummarySelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: input.offset,
        take: input.limit,
      });
      const total = await tx.adminDocument.count({ where });
      return {
        items: rows.map((row) =>
          dates({
            id: row.id,
            categoryId: row.categoryId,
            title: row.title,
            sourcePath: row.sourcePath,
            version: row.version,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }),
        ),
        total,
      };
    });
  }
  async document(id: string): Promise<AdminDocument> {
    const row = await this.client.adminDocument.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy tài liệu.');
    return dates(row);
  }
  async createDocument(input: AdminDocumentInput): Promise<AdminDocument> {
    return this.transaction(async (tx) => {
      if (
        !(await tx.adminCategory.findUnique({
          where: { id: input.categoryId },
        }))
      )
        throw new NotFoundException('Không tìm thấy danh mục.');
      return dates(
        await tx.adminDocument.create({
          data: {
            categoryId: input.categoryId,
            title: input.title,
            content: input.content,
            sourcePath: null,
          },
        }),
      );
    });
  }
  async updateDocument(
    id: string,
    input: AdminDocumentUpdateInput,
  ): Promise<AdminDocument> {
    return this.transaction(async (tx) => {
      current(
        await tx.adminDocument.findUnique({ where: { id } }),
        input.version,
      );
      if (
        !(await tx.adminCategory.findUnique({
          where: { id: input.categoryId },
        }))
      )
        throw new NotFoundException('Không tìm thấy danh mục.');
      changed(
        (
          await tx.adminDocument.updateMany({
            where: { id, version: input.version },
            data: {
              categoryId: input.categoryId,
              title: input.title,
              content: input.content,
              version: { increment: 1 },
            },
          })
        ).count,
      );
      return dates(await tx.adminDocument.findUniqueOrThrow({ where: { id } }));
    });
  }
  async deleteDocument(id: string, input: AdminDeleteInput): Promise<void> {
    return this.transaction(async (tx) => {
      current(
        await tx.adminDocument.findUnique({ where: { id } }),
        input.version,
      );
      changed(
        (
          await tx.adminDocument.deleteMany({
            where: { id, version: input.version },
          })
        ).count,
      );
    });
  }
}
