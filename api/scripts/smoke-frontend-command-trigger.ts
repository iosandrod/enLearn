process.env.FRONTEND_COMMAND_SMOKE_TRIGGER = 'required';
process.env.FRONTEND_COMMAND_SMOKE_TIMEOUT_MS ??= '45000';

void import('./smoke-frontend-command-delivery');
