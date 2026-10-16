import { ApplicationStatus } from '../enums/application-status.enum.js';
import { allowedHrTransitions, isFinalDecision } from './application-status-rules.js';

describe('allowedHrTransitions (mirror of update_application_status_v2)', () => {
  it('lets HR move forward from NEW, skipping stages, or decide', () => {
    expect(allowedHrTransitions(ApplicationStatus.NEW))
      .toEqual(['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED']);
  });

  it('never offers a backwards review stage', () => {
    expect(allowedHrTransitions(ApplicationStatus.SHORTLISTED)).toEqual(['INTERVIEW', 'SELECTED', 'REJECTED']);
    expect(allowedHrTransitions(ApplicationStatus.INTERVIEW)).toEqual(['SELECTED', 'REJECTED']);
  });

  it.each([ApplicationStatus.SELECTED, ApplicationStatus.REJECTED, ApplicationStatus.DRAFT])(
    'offers nothing for %s',
    (status) => {
      expect(allowedHrTransitions(status)).toEqual([]);
    },
  );

  it('treats only SELECTED and REJECTED as final', () => {
    expect(isFinalDecision(ApplicationStatus.SELECTED)).toBe(true);
    expect(isFinalDecision(ApplicationStatus.REJECTED)).toBe(true);
    expect(isFinalDecision(ApplicationStatus.INTERVIEW)).toBe(false);
  });
});
