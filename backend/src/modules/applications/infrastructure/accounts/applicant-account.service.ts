import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

export type ReviewedApplicantAuthUserResult =
  | { status: 'created'; authUserId: string }
  | { status: 'exists' };

interface AuthAdminError {
  code?: string;
  status?: number;
  message?: string;
}

@Injectable()
export class ApplicantAccountService {
  constructor(
    private readonly supabase:
      SupabaseService,
  ) {}

  // Call only after the review token has been validated and the submitted
  // email matched the draft's review email: using the emailed link is the
  // proof of email ownership that justifies a confirmed account.
  //
  // An existing account is never reused here. Proving control of the email
  // does not prove possession of that account's credentials, so the caller
  // must sign in to that account instead.
  async createReviewedApplicantAuthUser(
    email: string,
    fullName: string,
  ): Promise<ReviewedApplicantAuthUserResult> {
    const { data, error } =
      await this.supabase.client.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (error) {
      if (isExistingAccountError(error)) {
        return { status: 'exists' };
      }

      throw new ServiceUnavailableException(
        'We could not create your applicant account right now. Please try again later.',
      );
    }

    const authUserId = data.user?.id;
    if (!authUserId) {
      throw new ServiceUnavailableException(
        'We could not create your applicant account right now. Please try again later.',
      );
    }

    return { status: 'created', authUserId };
  }

  // Removes an Auth user created by the current request. Callers must only
  // use this after the database confirmed that nothing was linked to it.
  async deleteUnlinkedAuthUser(
    authUserId: string,
  ): Promise<boolean> {
    const { error } =
      await this.supabase.client.auth.admin.deleteUser(authUserId);

    return !error;
  }
}

function isExistingAccountError(error: AuthAdminError): boolean {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') {
    return true;
  }

  return error.status === 422 &&
    /already (been )?registered/i.test(error.message ?? '');
}
