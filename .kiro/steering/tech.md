Agents should NEVER write to this file.  Only humans should write to it.  Agents should read it but NEVER WRITE to it.

# Deployment: NEVER for agents

Agents should NEVER take actions such as "git push" that will deploy changes or modify the deployed applicaion.  Only humans will do that.  Agents can suggest that humans deploy the changes but should NEVER take that action themseles.

# Keeping notes and plans

Whenever you (the agent) make a plan or complete a task that is part of a plan, keep notes in .md files under agent-docs/.  When one of these docs is fully finished, prepend a line to the top that says "COMPLETED - SAVING FOR REFERENCE" and move it to an agent-docs/completed/ directory.  Avoid creating new markdown files unless it is a truly a new topic; prefer making updates to existing docs.  Do not allow these docs to get out of date or contain information we think is wrong.  On EVERY git commit, make sure that the docs fully reflect the current state.

# Git commits

NEVER commit anything without building successfully AND seeing 100% of tests passing.  

The agent should git commit its work.  Before EVERY commit, scan the contents for any hardcoded credentials or identifiers.  These should NEVER get committed.
