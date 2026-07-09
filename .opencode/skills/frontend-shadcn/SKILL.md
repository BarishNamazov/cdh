---
name: frontend-shadcn
description: Frontend component development guidance using shadcn/ui in a CDH project
---

# Frontend Implementation with shadcn/ui

Follow this workflow when implementing frontend components using shadcn/ui.

## Prerequisites

Verify the project has a `frontend/` directory. If not, inform the user that frontend work requires a frontend/ directory with a configured Next.js + shadcn/ui project.

## Steps

1. **Check config**: Verify `frontend.enabled` is true in `.opencode/cdh.json`.

2. **Read design docs**: Call `read_design_doc` with key `architecture` and `implementing-concepts` for design context.

3. **Identify concept actions**: Call `list_concepts` to understand available concepts. Frontend components should call concept actions via the API boundary.

4. **Create components** in `frontend/src/components/`:
   - Use shadcn/ui primitives (Button, Card, Input, etc.)
   - Keep components focused on one concern
   - Use TypeScript interfaces for props
   - Style with Tailwind CSS

5. **Create pages** in `frontend/src/app/`:
   - One page per major feature
   - Use Server Components by default
   - Client components only when needed (interactivity, hooks)

6. **Wire API calls**: Import from the app's API layer. Never call concepts directly from frontend — go through the request boundary.

## Rules
- Components must be in TypeScript
- Use existing shadcn/ui components; add new ones only when necessary
- Follow the project's existing patterns for component structure
