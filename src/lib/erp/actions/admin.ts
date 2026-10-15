// Phase 18: CEO-managed access control
import { AppSection, ConfigurableRole } from '../../stecsecure-types';
import { Action, done } from '../core';

export const updateAccessControl: Action<{ role: ConfigurableRole; sections: AppSection[] }, void> = (
  s,
  env,
  { role, sections }
) => {
  if (env.actor?.role !== 'CEO') throw new Error('Only the CEO can change access control.');
  return done({ ...s, accessControl: { ...s.accessControl, [role]: sections } }, undefined);
};
