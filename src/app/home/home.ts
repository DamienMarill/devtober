import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadgeImports, type BadgeVariants } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { DAYS, dayStatus, type DayStatus } from '../days';

const STATUS: Record<DayStatus, { label: string; variant: BadgeVariants['variant'] }> = {
  done: { label: 'Publié', variant: 'default' },
  today: { label: "Aujourd'hui", variant: 'secondary' },
  upcoming: { label: 'À venir', variant: 'outline' },
  missed: { label: 'Passé', variant: 'ghost' },
};

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    DatePipe,
    NgTemplateOutlet,
    HlmCardImports,
    HlmBadgeImports,
    HlmButtonImports,
  ],
  templateUrl: './home.html',
})
export default class Home {
  protected readonly days = DAYS.map((day) => {
    const status = dayStatus(day);
    return { ...day, status, ...STATUS[status] };
  });

  protected readonly doneCount = computed(
    () => this.days.filter((d) => d.status === 'done').length,
  );
}
