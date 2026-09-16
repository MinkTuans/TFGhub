import Link from 'next/link';
import { PixelStudioGuide } from '../../components/pixel-studio-guide';

export const metadata = {
  title: 'Hướng dẫn tạo game pixel | TFG Studio',
  description: 'Tạo, sửa và xuất bản game pixel với Đảo Đom Đóm. Hướng dẫn nhập PNG/WAV, JavaScript, lưu dự án và gửi duyệt.',
};

export default function PixelStudioGuidePage() {
  return <main><PixelStudioGuide /><p style={{textAlign:'center',padding:24}}><Link href="/studio">Mở Studio để bắt đầu →</Link></p></main>;
}
