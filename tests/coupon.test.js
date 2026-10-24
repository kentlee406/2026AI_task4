const { CouponError, normalizeCouponCode, applyCoupon } = require('../src/utils/coupon');

describe('Coupon 模組', () => {
  describe('normalizeCouponCode', () => {
    it.each([undefined, null, '', '   '])('未提供優惠碼 %j 時回傳 null', value => {
      expect(normalizeCouponCode(value)).toBeNull();
    });

    it('轉為大寫並去除前後空白', () => {
      expect(normalizeCouponCode(' flower100 ')).toBe('FLOWER100');
    });

    it.each([123, true, {}, []])('非字串 %j 會拋出 CouponError', value => {
      expect(() => normalizeCouponCode(value)).toThrow(CouponError);
    });
  });

  describe('applyCoupon', () => {
    it('未使用優惠碼時折扣為 0', () => {
      expect(applyCoupon({ subtotal: 1000 })).toEqual({ code: null, discount: 0 });
    });

    it.each([
      [800, 100],
      [1600, 100]
    ])('FLOWER100：小計 %i 元折抵 %i 元', (subtotal, discount) => {
      expect(applyCoupon({ subtotal, couponCode: 'FLOWER100' })).toEqual({
        code: 'FLOWER100',
        discount
      });
    });

    it('FLOWER100：小計 799 元未達門檻', () => {
      expect(() => applyCoupon({ subtotal: 799, couponCode: 'FLOWER100' })).toThrow(CouponError);
    });

    it.each([
      [1000, 100],
      [1234, 123],
      [1235, 124],
      [3000, 300],
      [3500, 300]
    ])('SPRING10：小計 %i 元折抵 %i 元（四捨五入、上限 300）', (subtotal, discount) => {
      expect(applyCoupon({ subtotal, couponCode: 'SPRING10' }).discount).toBe(discount);
    });

    it('SUMMER50 已失效', () => {
      expect(() => applyCoupon({ subtotal: 1000, couponCode: 'SUMMER50' })).toThrow('已失效');
    });

    it.each(['NOT-A-COUPON', 'constructor', '__proto__', 'toString'])(
      '無效優惠碼 %s 會拋出 CouponError',
      couponCode => {
        expect(() => applyCoupon({ subtotal: 1000, couponCode })).toThrow(CouponError);
      }
    );

    it('優惠碼不分大小寫，回傳的 code 為大寫', () => {
      expect(applyCoupon({ subtotal: 800, couponCode: 'flower100' })).toEqual({
        code: 'FLOWER100',
        discount: 100
      });
    });
  });
});
