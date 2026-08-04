function portraitCrop(size) {
  const width = Math.max(1, Math.round(Number(size?.width) || 0));
  const height = Math.max(1, Math.round(Number(size?.height) || 0));
  const targetRatio = 3 / 4;
  if (width / height > targetRatio) {
    const cropWidth = Math.max(1, Math.round(height * targetRatio));
    return { x: Math.max(0, Math.round((width - cropWidth) / 2)), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.max(1, Math.round(width / targetRatio));
  return { x: 0, y: Math.max(0, Math.round((height - cropHeight) / 2)), width, height: cropHeight };
}

function prepareResumePhoto(nativeImage, filePath) {
  const source = nativeImage.createFromPath(filePath);
  if (source.isEmpty()) throw new Error('无法读取这张照片，请改用 JPG、PNG、WebP 或 BMP。');
  return prepareResumePhotoImage(source);
}

function prepareResumePhotoImage(source) {
  if (!source || source.isEmpty()) throw new Error('无法读取这张照片，请改用 JPG、PNG、WebP 或 BMP。');
  const size = source.getSize();
  if (!size.width || !size.height) throw new Error('照片尺寸无效，请选择其他图片。');
  const resizeRatio = Math.min(1, 1200 / Math.max(size.width, size.height));
  const prepared = resizeRatio < 1
    ? source.resize({
      width: Math.max(1, Math.round(size.width * resizeRatio)),
      height: Math.max(1, Math.round(size.height * resizeRatio)),
      quality: 'best',
    })
    : source;
  const jpeg = prepared.toJPEG(88);
  if (!jpeg.length || jpeg.length > 2 * 1024 * 1024) throw new Error('照片处理失败或体积过大，请选择其他图片。');
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

module.exports = { portraitCrop, prepareResumePhoto, prepareResumePhotoImage };
