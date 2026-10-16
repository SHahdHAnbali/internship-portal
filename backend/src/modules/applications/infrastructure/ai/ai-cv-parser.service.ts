import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import OpenAI from 'openai';

import { cvTextList } from '../../domain/types/cv-list-text.js';
import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';

@Injectable()
export class AiCvParserService {
  private readonly client: OpenAI;
  private readonly logger = new Logger(AiCvParserService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {
    const apiKey =
      this.configService.get<string>(
        'ai.openRouterApiKey',
      );

    if (!apiKey) {
      throw new InternalServerErrorException(
        'OpenRouter API key is missing',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }

  async parse(
    cvText: string,
  ): Promise<ExtractedCvData> {
    try {
      const response =
        await this.client.chat.completions.create({
          model: 'openrouter/free',

          messages: [
            {
              role: 'system',
              content: `
You are a CV parsing engine.

Your task is to extract structured information from CV text.

Rules:
- Extract only information that explicitly exists in the CV.
- Do not invent or guess information.
- Email is a CRITICAL field.
- If an email address exists anywhere in the CV, you MUST return it in "email".
- Phone is a CRITICAL field.
- If a phone number exists anywhere in the CV, you MUST return it in "phone".
- Do not return null for a field if the information clearly exists in the CV.
- Use null only when a single value truly does not exist.
- Use [] only when a list truly does not exist.
- Return valid JSON only.
- Do not include markdown.
- Do not include explanations.
              `.trim(),
            },

            {
              role: 'user',
              content: `
Extract all available information from the following CV.

Return EXACTLY this JSON structure:

{
  "fullName": null,
  "email": null,
  "phone": null,
  "location": null,
  "summary": null,
  "education": [
    {
      "institution": null,
      "degree": null,
      "fieldOfStudy": null,
      "startDate": null,
      "endDate": null
    }
  ],
  "experience": [
    {
      "company": null,
      "position": null,
      "startDate": null,
      "endDate": null,
      "description": null
    }
  ],
  "skills": [],
  "languages": [],
  "certifications": [],
  "links": {
    "linkedin": null,
    "github": null,
    "portfolio": null
  }
}

Important extraction instructions:

1. Search the ENTIRE CV for the applicant's email address.
2. If an email like name@example.com appears anywhere, return it in "email".
3. Search the ENTIRE CV for a phone number and return it in "phone".
4. Extract the person's full name from the CV heading/contact area when available.
5. Extract city/country or address into "location".
6. Extract the professional/profile summary into "summary".
7. Extract ALL education entries.
8. Extract ALL work/internship experience entries.
9. Extract ALL explicitly listed skills.
10. Extract ALL languages and proficiency levels where present, each as one string such as "English — Advanced".
11. Extract ALL certifications.
12. Extract LinkedIn, GitHub, and portfolio URLs if present.
13. Do not leave information out merely because formatting is unusual.
14. Do not add fields outside the required JSON structure.

CV TEXT:

${cvText}
              `.trim(),
            },
          ],

          response_format: {
            type: 'json_object',
          },
        });

      const content =
        response.choices[0]?.message?.content;

      if (!content) {
        throw new InternalServerErrorException(
          'AI did not return CV data',
        );
      }

      let parsedData: Partial<ExtractedCvData>;

      try {
        parsedData = JSON.parse(content) as Partial<ExtractedCvData>;
      } catch {
        throw new InternalServerErrorException(
          'AI returned invalid JSON',
        );
      }

      const normalized =
        this.normalizeData(parsedData);

      if (!normalized.email) {
        // Never log parsed CV content: it contains personal data.
        this.logger.warn(
          'CV parsing completed without an email address',
        );

        throw new InternalServerErrorException(
          'Email could not be extracted from CV',
        );
      }

      return normalized;
    } catch (error) {
      // Log only the error type and status; provider errors may echo input.
      this.logger.error(
        `CV parsing failed (${describeError(error)})`,
      );

      if (
        error instanceof
        InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'CV processing is temporarily unavailable. Please try again.',
      );
    }
  }

  private normalizeData(
    data: Partial<ExtractedCvData>,
  ): ExtractedCvData {
    return {
      fullName:
        data.fullName ?? null,

      email:
        data.email ?? null,

      phone:
        data.phone ?? null,

      location:
        data.location ?? null,

      summary:
        data.summary ?? null,

      education:
        Array.isArray(data.education)
          ? data.education
          : [],

      experience:
        Array.isArray(data.experience)
          ? data.experience
          : [],

      // Plain strings only (structured entries become e.g. "English — Advanced").
      skills:
        cvTextList(data.skills),

      languages:
        cvTextList(data.languages),

      certifications:
        cvTextList(data.certifications),

      links: {
        linkedin:
          data.links?.linkedin ??
          null,

        github:
          data.links?.github ??
          null,

        portfolio:
          data.links?.portfolio ??
          null,
      },
    };
  }
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { name, status } = error as { name?: unknown; status?: unknown };
    const label = typeof name === 'string' ? name : 'Error';
    return typeof status === 'number' ? `${label}, status ${status}` : label;
  }

  return 'unknown error';
}
