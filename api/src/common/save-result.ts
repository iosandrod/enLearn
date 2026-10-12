import { ConflictException } from '@nestjs/common';

export function assertSaveResult(result: unknown) {
  if (
    result == null ||
    (Array.isArray(result) && (result.length === 0 || result.some((row) => row == null)))
  ) {
    throw new ConflictException('保存失败：未返回保存记录，请检查记录是否存在及是否具有写入权限。');
  }
}
