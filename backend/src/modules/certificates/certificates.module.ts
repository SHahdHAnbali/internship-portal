import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { CertificateRepository } from './domain/repositories/certificate.repository.js';
import { SupabaseCertificateRepository } from './infrastructure/repositories/supabase-certificate.repository.js';
import { HrCertificatesController } from './presentation/controllers/hr-certificates.controller.js';
import { InternCertificatesController } from './presentation/controllers/intern-certificates.controller.js';

// Certificates of completion: issued by the database when HR completes a
// placement; interns read their own current certificate, HR reads the
// history and reissues. Mentors and ADMIN have no route here.
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InternCertificatesController, HrCertificatesController],
  providers: [
    {
      provide: CertificateRepository,
      useClass: SupabaseCertificateRepository,
    },
  ],
})
export class CertificatesModule {}
