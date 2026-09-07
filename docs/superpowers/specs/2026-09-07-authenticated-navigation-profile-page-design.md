# Authenticated Navigation And Profile Page Design

## Goal

Make the global navigation reflect whether the browser has an IndieForge
session, move developer profile editing out of Studio, and let users end their
session from the navigation.

## Behavior

- Signed-out navigation remains `Discover`, `Studio`, and `Log in`.
- Signed-in navigation shows `Discover`, `Studio`, `Thông tin cá nhân`, and
  `Đăng xuất`; it does not show `Log in`.
- `/profile` is authenticated and contains the existing display-name and bio
  form, including its existing validation and save feedback.
- `/studio` contains only the user's games and draft-creation action.
- `Đăng xuất` calls the existing logout API, clears the HTTP-only session, and
  sends the browser to `/login`.

## Constraints

- Keep the current cookie authentication and API contracts unchanged.
- Do not add dependencies or unrelated styling/refactors.
- Verify the complete browser journey before replacing the running IP preview.
