import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NAV_ITEMS } from '../constants/navigation';
import { Role } from '../models/entities';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = (route.data?.['roles'] as Role[] | undefined) ?? [];

  if (!allowedRoles.length || authService.hasRole(allowedRoles)) {
    return true;
  }

  const role = authService.role();
  if (!role) {
    return router.createUrlTree(['/login']);
  }

  const fallbackRoute = NAV_ITEMS.find((item) => item.roles.includes(role))?.route ?? '/login';
  return router.createUrlTree([fallbackRoute]);
};
