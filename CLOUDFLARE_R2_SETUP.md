# Cloudflare R2 setup summary

อัปเดตล่าสุด: 2 ตุลาคม 2026

เอกสารนี้สรุปการตั้งค่า Cloudflare สำหรับย้ายรูปสินค้า APcncDIY จาก Supabase Storage ไปใช้ Cloudflare R2 แบบค่อยเป็นค่อยไป โดยยังไม่กระทบ Auth, PostgreSQL, Marketplace, รูปโปรไฟล์ หรือโมเดล 3D

## สถานะปัจจุบัน

- Cloudflare account ID: `a3020485faf2c15abee746e6d54a0d2d`
- Worker project เดิม: `apcncdiy`
- R2 bucket: `apcncdiy-assets`
- Location: Automatic — Asia Pacific (APAC)
- Storage class: Standard
- Custom domain: `https://storage.apcncdiy.com`
- Custom domain status: Active / Access Enabled
- R2 Development URL: ปิดอยู่
- ยังไม่ได้สร้าง R2 API token หรือ S3 access key
- ยังไม่มีการอัปโหลดไฟล์จริงเข้า R2
- โค้ด R2 ยังไม่ได้ deploy, commit หรือ push

## CORS ที่ตั้งค่าแล้ว

Bucket อนุญาตให้เว็บไซต์ production อ่านรูปผ่าน `GET` และ `HEAD` เท่านั้น

```json
[
  {
    "AllowedOrigins": [
      "https://apcncdiy.com",
      "https://www.apcncdiy.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

การอัปโหลดและลบไฟล์จะไม่เปิดผ่าน CORS โดยตรง แต่ส่งผ่าน Worker API ของ `apcncdiy.com` เพื่อไม่ให้ R2 credentials อยู่ในเบราว์เซอร์

## Wrangler CLI

- ใช้ Wrangler `4.146.0` ผ่าน `npx`
- ล็อกอิน Cloudflare ด้วย OAuth สำเร็จ
- Credentials ถูกเก็บในไฟล์เข้ารหัส และกุญแจอยู่ใน Windows Credential Manager
- CLI ตรวจพบบัญชีและ bucket `apcncdiy-assets` ถูกต้อง
- ไม่ได้สร้างหรือบันทึก Cloudflare API token ใน Repo

## โครงสร้างที่เตรียมใน Repo

### `wrangler.jsonc`

- เพิ่ม Worker entry point: `worker.js`
- เพิ่ม R2 binding ชื่อ `PRODUCT_IMAGES`
- ผูก binding กับ bucket `apcncdiy-assets`
- เพิ่ม Assets binding ชื่อ `ASSETS`
- ให้ Worker ทำงานก่อนเฉพาะ route `/api/*` เพื่อให้หน้าเว็บ static เดิมยังทำงานแบบเดิม

### `worker.js`

เตรียม endpoint ดังนี้:

- `POST /api/product-images/upload?folder=covers|gallery|variants`
- `GET /api/product-images/object/<object-key>`
- `HEAD /api/product-images/object/<object-key>`
- `DELETE /api/product-images/object/<object-key>`

ข้อกำหนดด้านความปลอดภัย:

- Upload และ Delete ต้องมี Supabase access token
- Worker ตรวจ token กับ Supabase Auth server
- Worker ตรวจซ้ำว่า `profiles.role` เป็น `admin`
- รองรับเฉพาะ JPG, PNG และ WebP
- จำกัดขนาดไฟล์ไม่เกิน 15 MB
- สร้างชื่อไฟล์ด้วย UUID ไม่ใช้ชื่อไฟล์จากผู้ใช้เป็น object key
- จำกัด object key ให้อยู่ภายใต้ `product-images/`
- ไม่มี service-role key หรือ secret อยู่ใน source code

โครงสร้าง object key ที่จะใช้:

```text
product-images/
├─ covers/YYYY/MM/<uuid>.jpg
├─ gallery/YYYY/MM/<uuid>.webp
└─ variants/YYYY/MM/<uuid>.png
```

### `product-storage.js`

เป็นตัวกลางให้หน้าเว็บอ่านรูปผ่าน URL โดยไม่ต้องรู้รายละเอียด R2 หรือ Supabase

- รูปใหม่จาก R2 บันทึก path ในฐานข้อมูลเป็น `r2:product-images/...`
- รูปเก่าที่ยังเป็น `covers/...`, `gallery/...` หรือ `variants/...` ยังคงอ่านจาก Supabase bucket `site-products`
- URL ของรูป R2 ใช้ `https://storage.apcncdiy.com/...`
- หน้าเว็บรองรับอ่านรูปจากทั้งสองระบบพร้อมกัน

หน้าเว็บที่เตรียมให้ใช้ตัวกลางนี้แล้ว:

- `admin-products.html`
- `products.html`
- `product-detail.html`

## Rollback

ใน `product-storage.js` มีสวิตช์:

```js
const WRITE_BACKEND="r2";
```

หากต้องย้อนกลับ ให้เปลี่ยนเป็น:

```js
const WRITE_BACKEND="supabase";
```

หลัง rollback:

- การอัปโหลดใหม่จะกลับไปที่ Supabase bucket `site-products`
- รูปที่เคยอัปโหลดไป R2 ยังอ่านได้
- รูปเดิมใน Supabase ยังอ่านได้
- ไม่ต้องแก้ข้อมูลเก่าหรือย้ายไฟล์กลับทันที

## ผลการทดสอบในเครื่อง

- Wrangler dry-run build ผ่าน
- R2 binding และ Assets binding ถูกตรวจพบถูกต้อง
- Static asset ตอบ `200`
- API route ที่ไม่มีอยู่ตอบ `404`
- Upload ที่ไม่มี token ตอบ `401`
- Object ที่ไม่มีอยู่ตอบ `404`
- ทดลองเขียนและอ่าน object ใน R2 local ผ่าน
- Read endpoint ส่ง `Content-Type`, `Cache-Control`, `Content-Length` และ `ETag` ถูกต้อง
- ทดสอบการสร้าง URL สำหรับรูป Supabase เดิมและรูป R2 ใหม่ผ่าน
- `git diff --check` ผ่าน มีเพียงคำเตือนเรื่อง LF/CRLF ของ Windows

การทดสอบทั้งหมดใช้ R2 local state ไม่ได้เขียนไฟล์ทดสอบลง bucket production

## สิ่งที่ยังไม่ได้ทำ

- ยังไม่ได้ deploy Worker ขึ้น production
- ยังไม่ได้ commit หรือ push การแก้ไขไป GitHub
- ยังไม่ได้ทดสอบ upload ด้วยบัญชี Admin บน production
- ยังไม่ได้ย้ายรูปสินค้าเก่าจาก Supabase ไป R2
- ยังไม่ได้เปลี่ยน Marketplace, รูปโปรไฟล์ หรือโมเดล 3D

## ขั้นตอนถัดไปที่แนะนำ

1. ตรวจ diff ของ Repo และยืนยัน deploy
2. Deploy Worker โดยใช้ Wrangler หรือ commit/push ผ่าน workflow เดิม
3. ทดสอบอัปโหลดรูปสินค้าทดลองหนึ่งรูปด้วยบัญชี Admin
4. ตรวจว่าไฟล์อยู่ใต้ `product-images/` และเปิดผ่าน `storage.apcncdiy.com` ได้
5. ตรวจหน้ารายการสินค้าและหน้ารายละเอียดทั้ง desktop/mobile
6. ทดสอบว่ารูปเก่าจาก Supabase ยังแสดงตามปกติ
7. เมื่อมั่นใจแล้วจึงเริ่มวางแผนย้ายรูปสินค้าเก่าเป็นงานแยก

## ข้อควรระวัง

Custom domain ของ bucket นี้เปิดอ่านแบบ public ดังนั้น bucket `apcncdiy-assets` ควรใช้เฉพาะไฟล์ public เช่นรูปสินค้าเท่านั้น หากย้ายโมเดลหรือไฟล์ Marketplace ที่ต้องจำกัดสิทธิ์ ควรใช้ bucket private แยกต่างหากและอ่านผ่าน Worker ที่ตรวจสิทธิ์

## อัปเดตหลังการย้ายสินค้าทดลอง

วันที่ 2 ตุลาคม 2026 ได้ deploy โค้ดจาก GitHub commit `7811b06` และย้ายรูปที่ใช้งานจริง 3 รูปของสินค้า `ดอกตัด Compression 2 คม` ไปยัง R2 สำเร็จแล้ว ฐานข้อมูลเก็บพาธใหม่ในรูปแบบ `r2:product-images/...` และหน้า production แสดงรูปปกกับรูปตัวเลือกทั้งสองได้ครบ

ไฟล์ต้นฉบับใน Supabase Storage ยังเก็บไว้ทั้งหมดเพื่อ rollback รายละเอียด mapping และ SQL สำหรับย้อนกลับอยู่ใน `CLOUDFLARE_R2_PRODUCT_MIGRATION_2026-10-02.md`
