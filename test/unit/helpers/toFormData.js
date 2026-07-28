import assert from 'assert';
import toFormData from '../../../lib/helpers/toFormData.js';
import AxiosError from '../../../lib/core/AxiosError.js';
import AxiosURLSearchParams from '../../../lib/helpers/AxiosURLSearchParams.js';
import FormData from 'form-data';

describe('helpers::toFormData', function () {
  // --- Depth limit tests ---

  function nest(depth) {
    let o = { leaf: 1 };
    for (let i = 0; i < depth; i++) o = { a: o };
    return o;
  }

  describe('maxDepth option', function () {
    it('should throw AxiosError when payload exceeds default depth limit (100)', function () {
      try {
        toFormData(nest(101), new FormData());
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof AxiosError, 'error must be AxiosError, not RangeError');
        assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
        assert.ok(!(err instanceof RangeError));
      }
    });

    it('should succeed when payload is exactly at the default depth limit (100)', function () {
      const formData = toFormData(nest(100), new FormData());
      assert.ok(formData instanceof FormData);
    });

    it('should succeed for a shallow payload (no regression)', function () {
      const formData = toFormData(nest(5), new FormData());
      assert.ok(formData instanceof FormData);
    });

    it('should allow deeper payloads when maxDepth is raised', function () {
      const formData = toFormData(nest(150), new FormData(), { maxDepth: 200 });
      assert.ok(formData instanceof FormData);
    });

    it('should reject shallower payloads when maxDepth is lowered', function () {
      try {
        toFormData(nest(10), new FormData(), { maxDepth: 5 });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof AxiosError);
        assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      }
    });

    it('should not throw for depth guard when maxDepth is Infinity (guard disabled)', function () {
      const formData = toFormData(nest(500), new FormData(), { maxDepth: Infinity });
      assert.ok(formData instanceof FormData);
    });

    it('should still detect circular references when depth guard is active', function () {
      const data = { foo: 'bar' };
      data.self = data;
      try {
        toFormData(data, new FormData());
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(
          err.message.includes('Circular reference detected'),
          'must be circular-ref error'
        );
        assert.ok(!(err instanceof AxiosError) || err.code !== 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      }
    });

    it('depth limit error is catchable as AxiosError with correct code', function () {
      let caught;
      try {
        toFormData(nest(101), new FormData());
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof AxiosError);
      assert.strictEqual(caught.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      assert.ok(!(caught instanceof RangeError));
    });
  });

  describe('maxDepth — params serialization via AxiosURLSearchParams', function () {
    it('should throw AxiosError for deeply nested params object (default limit)', function () {
      try {
        new AxiosURLSearchParams(nest(101));
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof AxiosError);
        assert.strictEqual(err.code, 'ERR_FORM_DATA_DEPTH_EXCEEDED');
      }
    });

    it('should build query string for deep params when maxDepth is raised', function () {
      const params = new AxiosURLSearchParams(nest(150), { maxDepth: 200 });
      const qs = params.toString();
      assert.ok(typeof qs === 'string' && qs.length > 0);
    });
  });
});
