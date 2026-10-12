"""Builds e2e/fixtures/jbig2-scan.pdf: a 3-page, image-only PDF whose pages are JBIG2 (MMR) images, like many scans.

Usage: python3 scripts/make-jbig2-fixture.py page1.png page2.png out.pdf   (pages are repeated to make three)
Needs Pillow. JBIG2 is assembled by hand: a page-information segment plus an immediate generic region segment whose
payload is CCITT Group 4 data written by Pillow (MMR coding), as described in the PDF and JBIG2 specifications.
"""
import io, struct, sys
from PIL import Image, ImageOps

def g4_bytes(im):
    buf = io.BytesIO()
    # one strip only: each strip is an independent Group 4 stream, and JBIG2 wants a single one
    # JBIG2 and CCITT disagree about which pixel value is black, so invert before encoding
    ImageOps.invert(im.convert('L')).convert('1').save(buf, format='TIFF', compression='group4', tiffinfo={278: im.size[1]})
    buf.seek(0)
    t = Image.open(buf)
    off, cnt = t.tag_v2[273], t.tag_v2[279]
    off = off if isinstance(off, int) else off[0]
    cnt = cnt if isinstance(cnt, int) else cnt[0]
    assert not isinstance(t.tag_v2[273], tuple) or len(t.tag_v2[273]) == 1, 'expected a single strip'
    return buf.getvalue()[off:off + cnt]

def segment(number, seg_type, page, data):
    # number(4) flags(1: type) referred-to(1: none) page association(1) data length(4)
    return struct.pack('>IBBBI', number, seg_type, 0, page, len(data)) + data

def jbig2(im):
    w, h = im.size
    page_info = struct.pack('>IIIIBH', w, h, 0, 0, 0, 0)  # no resolution, default pixel 0, no striping
    region = struct.pack('>IIIIB', w, h, 0, 0, 0) + b'\x01' + g4_bytes(im)  # region info (OR), generic flags: MMR
    return segment(0, 48, 1, page_info) + segment(1, 38, 1, region)

def pdf(pages):
    objs, ids = [], []
    def add(body):
        objs.append(body); return len(objs)
    cat = add(None); pgs = add(None)
    for im in pages:
        w, h = im.size
        data = jbig2(im)
        img = add(b'<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /JBIG2Decode /Length %d >>\nstream\n' % (w, h, len(data)) + data + b'\nendstream')
        content = b'q 595 0 0 842 0 0 cm /Im0 Do Q'
        c = add(b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream')
        p = add(b'<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>' % (pgs, img, c))
        ids.append(p)
    objs[cat - 1] = b'<< /Type /Catalog /Pages %d 0 R >>' % pgs
    objs[pgs - 1] = b'<< /Type /Pages /Kids [%s] /Count %d >>' % (b' '.join(b'%d 0 R' % i for i in ids), len(ids))
    out = io.BytesIO(); out.write(b'%PDF-1.5\n%\xe2\xe3\xcf\xd3\n'); offs = []
    for n, body in enumerate(objs, 1):
        offs.append(out.tell()); out.write(b'%d 0 obj\n' % n + body + b'\nendobj\n')
    x = out.tell(); out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1))
    for o in offs: out.write(b'%010d 00000 n \n' % o)
    out.write(b'trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF' % (len(objs) + 1, cat, x))
    return out.getvalue()

if __name__ == '__main__':
    a, b, dest = sys.argv[1:4]
    ims = [Image.open(p).convert('L').resize((827, 1170)).point(lambda v: 255 if v > 160 else 0).convert('1') for p in (a, b)]
    open(dest, 'wb').write(pdf([ims[0], ims[1], ims[0]]))
