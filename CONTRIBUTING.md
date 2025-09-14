# Contributing

Thank you for helping improve FlutterPos!

## Development Workflow
- Install dependencies with `npm install`.
- Run type checking and tests with `npm run check` and `npm test` before submitting a pull request.
- Format and lint your code as needed.
- Run `npm run validate:srs` when modifying routes, models, or features to ensure the SRS stays in sync.
- Optionally enable the provided git hooks with `git config core.hooksPath githooks` to run the SRS check automatically on commit.

## Updating the SRS
Any change to routes, data models, or feature behaviour **must** include an update to [`docs/SRS.md`](docs/SRS.md). The document is the authoritative Software Requirements Specification and should remain synchronized with the implementation.

## SRS Validation
Use `npm run validate:srs` to locally verify that any changes touching server, client, or shared code are accompanied by an update to `docs/SRS.md`. The same check runs in CI and will fail if the SRS is not updated.

## Pull Requests
- Keep commits focused and descriptive.
- Ensure the repository passes all tests and checks.
- Reference relevant issues in your commit messages or pull request descriptions.

