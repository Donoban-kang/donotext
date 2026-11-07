# Regenerates real.docx/real.pptx/real.xlsx/cid.pdf with python-docx, python-pptx, openpyxl and reportlab.
# Independent writers on purpose: the converters must read what other programs produce, not only our own test helpers.
# Usage: cd tests/fixtures/import && python3 make-office-samples.py
import datetime
from docx import Document
from docx.shared import Pt
from pptx import Presentation
from pptx.util import Inches
import openpyxl
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

# ---- docx
d = Document()
d.add_heading('2026년 정보보안 점검 결과 보고', 0)
d.add_heading('1. 추진 배경', 1)
d.add_paragraph('관내 학교의 정보보안 수준을 높이기 위하여 점검을 실시하였습니다. ' * 3)
d.add_paragraph('점검 대상 확인', style='List Bullet')
d.add_paragraph('결과 종합', style='List Bullet')
d.add_paragraph('개선과제 도출', style='List Number')
d.add_paragraph('후속 조치 지원', style='List Number')
d.add_heading('2. 점검 결과', 1)
t = d.add_table(rows=3, cols=3)
t.style = 'Table Grid'
for r, row in enumerate([['구분', '항목', '배점'], ['관리', '개인정보 처리방침 게시', '10'], ['기술', 'PC 백신 설치', '20']]):
    for c, v in enumerate(row):
        t.cell(r, c).text = v
p = d.add_paragraph()
run = p.add_run('굵은 글씨와 ')
run.bold = True
p.add_run('기울임').italic = True
d.save('real.docx')

# ---- pptx
pr = Presentation()
s = pr.slides.add_slide(pr.slide_layouts[1])
s.shapes.title.text = '사업 개요'
tf = s.placeholders[1].text_frame
tf.text = '첫 번째 항목'
para = tf.add_paragraph(); para.text = '하위 항목'; para.level = 1
para = tf.add_paragraph(); para.text = '두 번째 항목'
s.notes_slide.notes_text_frame.text = '발표 때 강조할 점입니다.'
s2 = pr.slides.add_slide(pr.slide_layouts[5])
s2.shapes.title.text = '예산 표'
tbl = s2.shapes.add_table(3, 2, Inches(1), Inches(2), Inches(6), Inches(1.5)).table
for r, row in enumerate([['항목', '금액'], ['소프트웨어', '1,200'], ['하드웨어', '3,400']]):
    for c, v in enumerate(row):
        tbl.cell(r, c).text = v
s3 = pr.slides.add_slide(pr.slide_layouts[6])
tb = s3.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1))
tb.text_frame.text = '제목 없는 슬라이드의 글'
pr.save('real.pptx')

# ---- xlsx
wb = openpyxl.Workbook()
ws = wb.active
ws.title = '예산'
ws.append(['항목', '금액', '비율', '날짜'])
ws.append(['소프트웨어', 1234567, 0.256, datetime.date(2026, 5, 1)])
ws.append(['하드웨어', 3400.5, 0.5, datetime.datetime(2026, 5, 2, 14, 30)])
ws['B2'].number_format = '#,##0'
ws['C2'].number_format = '0.0%'
ws['C3'].number_format = '0%'
ws['D2'].number_format = 'yyyy-mm-dd'
ws['D3'].number_format = 'yyyy-mm-dd hh:mm'
ws.merge_cells('A5:C5')
ws['A5'] = '합친 셀'
ws['A6'] = '=B2+B3'
h = wb.create_sheet('숨김'); h.append(['비밀']); h.sheet_state = 'hidden'
wb.create_sheet('메모').append(['내용'])
wb.save('real.xlsx')

# ---- pdf with NON-embedded Korean CID font (needs cmaps to extract)
pdfmetrics.registerFont(UnicodeCIDFont('HYSMyeongJo-Medium'))
c = canvas.Canvas('cid.pdf', pagesize=(595, 842))
c.setFont('HYSMyeongJo-Medium', 24); c.drawCentredString(297, 760, '2026년 학교 정보보안 점검 계획')
c.setFont('HYSMyeongJo-Medium', 11)
lines = ['수신 각급 학교장', '제목 2026년 학교 정보보안 점검 계획 알림', '1. 관련: 교육부 정보보안과-1234(2026. 3. 2.)',
 '2. 학교의 정보보안 수준을 높이기 위해 다음과 같이 점검을 추진하니 협조하여 주시기 바랍니다.']
y = 720
for l in lines:
    c.drawString(56, y, l); y -= 22
c.drawString(72, y, '가. 점검 기간: 2026. 5. 1. ~ 5. 31.'); y -= 22
c.drawString(72, y, '나. 점검 대상: 관내 전체 학교'); y -= 22
c.showPage(); c.save()
print('ok')

# ---- pdf: encrypted (user password) and blank (like a scan with no text layer)
c = canvas.Canvas('encrypted.pdf', pagesize=(595, 842), encrypt='secret')
c.drawString(72, 700, 'secret text'); c.showPage(); c.save()
c = canvas.Canvas('blank.pdf', pagesize=(595, 842))
c.showPage(); c.showPage(); c.save()
