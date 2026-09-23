# Render requests

Changing `request.json` and pushing starts `.github/workflows/render.yml`: the film is cut into `slices` pieces rendered at once on GitHub's runners, joined, given its soundtrack, and posted to a pre-release called `render-<film>-<quality>`.

- `film`: a folder in `film/` (`day`, `attract`)
- `quality`: `final`, or `draft` for a quick look
- `slices`: how many runners share the work (up to 20)
- `reuse`: an earlier run's id, to join that run's slices again under the current soundtrack without rendering anything (slices are kept for three days)
- `note`: anything, so that each request is a new commit
