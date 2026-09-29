import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { requireActiveAccount } from '../common/utils/account-context';
import { ServiceRouterService } from './service-router.service';

type UploadedBinaryFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('files')
export class FileUploadController {
  constructor(
    @Inject(ServiceRouterService)
    private readonly router: ServiceRouterService
  ) {}

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }
  }))
  async upload(
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
    @Headers('x-account-id') accountId?: string,
    @Headers('x-request-id') requestId?: string
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('file is required.');
    }

    const resolved = await requireActiveAccount(
      { authorization, requestId, serviceName: 'files' },
      accountId
    );
    const data = await this.router.invoke(
      'files',
      'runAction',
      {
        resource: 'file_objects',
        operation: 'uploadFile',
        originalName: file.originalname,
        mimeType: file.mimetype || null,
        sizeBytes: file.size,
        fileBase64: file.buffer.toString('base64'),
        visibility: body.visibility,
        metadata: body.metadata,
        bucket: body.bucket,
        folderPath: body.folderPath ?? body.folder_path,
        objectKey: body.objectKey ?? body.object_key
      },
      resolved.context
    );

    return { success: true, data };
  }
}
