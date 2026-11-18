# Wraps scan-sample.png into scanned PDFs. Run make-scan-samples.cjs first (it renders the picture).
# Usage: cd tests/fixtures/import && python3 make-scan-samples.py
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
import io

rgb = Image.open('scan-sample.png').convert('RGB')
bw = rgb.convert('L').point(lambda v: 255 if v > 140 else 0).convert('1')
# page 1: JPEG picture, page 2: 1-bit CCITT G4 picture (what many office scanners write)
rgb.save('scan-sample.pdf', save_all=True, append_images=[bw], resolution=150.0)  # JPEG for RGB, CCITT G4 for 1-bit

# mixed: page 1 has a real text layer, page 2 is the scan
pdfmetrics.registerFont(UnicodeCIDFont('HYSMyeongJo-Medium'))
c = canvas.Canvas('mixed.pdf', pagesize=(595, 842))
c.setFont('HYSMyeongJo-Medium', 14)
c.drawString(56, 780, '1쪽은 글자가 들어 있는 쪽입니다.')
c.drawString(56, 756, '2쪽은 스캔한 그림 쪽입니다.')
c.showPage()
buf = io.BytesIO(); rgb.save(buf, 'JPEG', quality=85); buf.seek(0)
from reportlab.lib.utils import ImageReader
c.drawImage(ImageReader(buf), 0, 0, width=595, height=842)
c.showPage(); c.save()
print('ok')
