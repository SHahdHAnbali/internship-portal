export class Internship {
    constructor(
      public readonly id: string,
      public readonly title: string,
      public readonly isActive: boolean,
      public readonly createdAt: Date,
    ) {}
  }