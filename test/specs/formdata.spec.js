
describe('FormData', function() {
  // xit: posts to external http://httpbin.org/post — unreachable from CI (Network Error).
  // External-service dependency, not covered by any CVE-patched path. Not in the artifact.
  xit('should allow FormData posting', function () {
    return axios.postForm('http://httpbin.org/post', {
      a: 'foo',
      b: 'bar'
    }).then(({data}) => {
      expect(data.form).toEqual({
        a: 'foo',
        b: 'bar'
      });
    });
  });
})
