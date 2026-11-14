# CI workflow (not active yet)

`engine-tests.yml` runs the engine tests on every push that touches `engine/`.
It lives here because the Partner session's GitHub token cannot push files under `.github/workflows/` (it lacks the `workflow` scope).

To turn it on, someone with that scope moves it:

```
git mv engine/ci/engine-tests.yml .github/workflows/engine-tests.yml
```

Or the repository owner runs `gh auth refresh -h github.com -s workflow` once, and the Partner session moves it.

Until then, run the tests locally: `node --test engine/test/engine.test.js` (Node 20 or newer).
