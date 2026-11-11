# TeamShape Canvas Studio — Cloudflare Pages

เว็บแอป Organization Chart แบบ Canvas สำหรับวางแผนโครงสร้างองค์กรและจำลองต้นทุนพนักงาน

## ไฟล์

- `public/index.html` — ตัวแอปทั้งหมด (Vanilla JavaScript + CSS, ไม่มี build step)
- `public/_headers` — HTTP response headers
- `public/robots.txt` — ไม่ให้ crawler ทำดัชนีเว็บทดลอง (ไม่ใช่ระบบความปลอดภัย)

## Deploy ผ่าน GitHub + Cloudflare Pages

1. สร้าง **Private Repository** ใหม่บน GitHub ชื่อ `teamshape-workspace` แล้วอัปโหลดไฟล์จาก ZIP นี้ โดยให้โฟลเดอร์ `public` อยู่ที่ root ของ repo
2. ไปที่ [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create application → Pages → Connect to Git
3. เลือก GitHub repository `teamshape-workspace` และ branch `main`
4. ตั้งค่าการ Build:
   - Framework preset: **None**
   - Build command: **เว้นว่าง**
   - Build output directory: **public**
   - Root directory: **/** (repo root)
5. Deploy จากนั้นเปิด URL `https://<ชื่อโปรเจกต์>.pages.dev`

การ push commit ถัดไปขึ้น main จะกระตุ้น auto-deploy (หากผูก Git integration สำเร็จ)

## ทดลองในเครื่อง

```bash
python3 -m http.server 8080 -d public
```

เปิด http://localhost:8080/

## ความปลอดภัยและข้อมูล

เวอร์ชันนี้เป็น **Demo** และแสดงรายชื่อ/เงินเดือนจำลองเท่านั้น ข้อมูลแผนงานที่แก้ในหน้าเว็บถูกเก็บใน browser `localStorage` ของเครื่องที่เปิดใช้งาน **ไม่ถูก sync ไป Cloudflare หรือแชร์ข้ามเครื่อง** ไม่มีระบบ Login/กำหนดสิทธิ์ ไม่มีฐานข้อมูลกลาง

**อย่านำข้อมูลเงินเดือนจริง/เอกสารพนักงานจริงมาใช้บนเว็บสาธารณะในเวอร์ชันนี้** จนกว่าจะมีระบบยืนยันตัวตน การควบคุมสิทธิ์ และจัดเก็บข้อมูลที่เหมาะสม การใช้ `robots.txt` หรือ Private GitHub repository ไม่ได้ทำให้ Pages URL เป็นเว็บส่วนตัว
