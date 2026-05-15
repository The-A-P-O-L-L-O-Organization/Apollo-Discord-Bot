export default {
    name: 'nova',
    description: 'Na\'vi language tools',
    commands: [
        {
            name: 'word',
            description: 'Get a random Na\'vi word',
            options: [],
            execute: async (args) => {
                const res = await fetch('https://reykunyu.lu/api/random?holpxay=1&fnel=n');
                if (!res.ok) return { success: false, message: 'Failed to fetch Na\'vi word' };
                const data = await res.json();
                return { navi: data.navi, english: data.english };
            }
        },
        {
            name: 'today',
            description: 'Get word of the day',
            options: [],
            execute: async (args) => {
                const res = await fetch('https://reykunyu.lu/api/random?holpxay=1&fnel=n');
                if (!res.ok) return { success: false, message: 'Failed to fetch Na\'vi word' };
                const data = await res.json();
                return { navi: data.navi, english: data.english, date: new Date().toISOString().split('T')[0] };
            }
        }
    ]
};
